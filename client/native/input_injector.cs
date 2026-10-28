using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace AntigravityRemoteInput
{
    class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        static extern int GetSystemMetrics(int nIndex);

        const int SM_CXSCREEN = 0;
        const int SM_CYSCREEN = 1;
        const int SM_CXVIRTUALSCREEN = 78;
        const int SM_CYVIRTUALSCREEN = 79;
        const int SM_XVIRTUALSCREEN = 76;
        const int SM_YVIRTUALSCREEN = 77;

        const int INPUT_MOUSE = 0;
        const int INPUT_KEYBOARD = 1;

        const uint MOUSEEVENTF_MOVE = 0x0001;
        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;
        const uint MOUSEEVENTF_ABSOLUTE = 0x8000;
        const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;
        const uint KEYEVENTF_SCANCODE = 0x0008;

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public int type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
            [FieldOffset(0)]
            public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        static void Main(string[] args)
        {
            try
            {
                SetProcessDPIAware();
            }
            catch { }

            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine("{\"status\":\"ready\"}");

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "exit" || line == "quit") break;

                try
                {
                    ProcessCommand(line);
                }
                catch (Exception ex)
                {
                    Console.WriteLine("{\"error\":\"" + Escape(ex.Message) + "\"}");
                }
            }
        }

        static void ProcessCommand(string json)
        {
            string action = GetJsonValue(json, "action");
            if (string.IsNullOrEmpty(action)) return;

            switch (action)
            {
                case "get_screen_size":
                    int screenW = GetSystemMetrics(SM_CXSCREEN);
                    int screenH = GetSystemMetrics(SM_CYSCREEN);
                    int vW = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                    int vH = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                    Console.WriteLine(string.Format("{{\"width\":{0},\"height\":{1},\"virtualWidth\":{2},\"virtualHeight\":{3}}}",
                        screenW, screenH, vW > 0 ? vW : screenW, vH > 0 ? vH : screenH));
                    break;

                case "mouse_move":
                    double xNorm = GetJsonDouble(json, "x");
                    double yNorm = GetJsonDouble(json, "y");
                    // x, y are normalized [0.0 .. 1.0] or absolute pixels
                    bool isNormalized = GetJsonBool(json, "norm", true);
                    
                    int targetX, targetY;
                    if (isNormalized)
                    {
                        targetX = (int)(xNorm * 65535.0);
                        targetY = (int)(yNorm * 65535.0);
                    }
                    else
                    {
                        int vWidth = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                        if (vWidth == 0) vWidth = GetSystemMetrics(SM_CXSCREEN);
                        int vHeight = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                        if (vHeight == 0) vHeight = GetSystemMetrics(SM_CYSCREEN);
                        targetX = (int)((xNorm / vWidth) * 65535.0);
                        targetY = (int)((yNorm / vHeight) * 65535.0);
                    }

                    INPUT[] moveInputs = new INPUT[1];
                    moveInputs[0].type = INPUT_MOUSE;
                    moveInputs[0].u.mi.dx = targetX;
                    moveInputs[0].u.mi.dy = targetY;
                    moveInputs[0].u.mi.dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
                    SendInput(1, moveInputs, Marshal.SizeOf(typeof(INPUT)));
                    break;

                case "mouse_down":
                case "mouse_up":
                    string btn = GetJsonValue(json, "button");
                    bool isDown = action == "mouse_down";
                    uint flag = 0;
                    if (btn == "right") flag = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
                    else if (btn == "middle") flag = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
                    else flag = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;

                    INPUT[] clickInputs = new INPUT[1];
                    clickInputs[0].type = INPUT_MOUSE;
                    clickInputs[0].u.mi.dwFlags = flag;
                    SendInput(1, clickInputs, Marshal.SizeOf(typeof(INPUT)));
                    break;

                case "mouse_wheel":
                    int deltaY = GetJsonInt(json, "deltaY", 0);
                    if (deltaY == 0) deltaY = GetJsonInt(json, "delta", 0);
                    INPUT[] wheelInputs = new INPUT[1];
                    wheelInputs[0].type = INPUT_MOUSE;
                    wheelInputs[0].u.mi.dwFlags = MOUSEEVENTF_WHEEL;
                    wheelInputs[0].u.mi.mouseData = (uint)(-deltaY); // Windows standard wheel direction
                    SendInput(1, wheelInputs, Marshal.SizeOf(typeof(INPUT)));
                    break;

                case "key_down":
                case "key_up":
                    int vk = GetJsonInt(json, "vk", 0);
                    int scan = GetJsonInt(json, "scan", 0);
                    string unicodeChar = GetJsonValue(json, "char");
                    bool isKeyUp = action == "key_up";

                    INPUT[] keyInputs = new INPUT[1];
                    keyInputs[0].type = INPUT_KEYBOARD;

                    if (!string.IsNullOrEmpty(unicodeChar) && unicodeChar.Length > 0 && vk == 0)
                    {
                        keyInputs[0].u.ki.wScan = (ushort)unicodeChar[0];
                        keyInputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE | (isKeyUp ? KEYEVENTF_KEYUP : 0);
                    }
                    else
                    {
                        keyInputs[0].u.ki.wVk = (ushort)vk;
                        keyInputs[0].u.ki.wScan = (ushort)scan;
                        uint kFlags = isKeyUp ? KEYEVENTF_KEYUP : 0;
                        if (vk == 0x21 || vk == 0x22 || vk == 0x23 || vk == 0x24 || 
                            vk == 0x25 || vk == 0x26 || vk == 0x27 || vk == 0x28 || 
                            vk == 0x2D || vk == 0x2E) // Extended keys: Insert, Delete, Home, End, Arrows, etc.
                        {
                            kFlags |= KEYEVENTF_EXTENDEDKEY;
                        }
                        keyInputs[0].u.ki.dwFlags = kFlags;
                    }
                    SendInput(1, keyInputs, Marshal.SizeOf(typeof(INPUT)));
                    break;
            }
        }

        static string GetJsonValue(string json, string key)
        {
            var match = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
            return match.Success ? match.Groups[1].Value : null;
        }

        static int GetJsonInt(string json, string key) { return GetJsonInt(json, key, 0); }
        static int GetJsonInt(string json, string key, int defaultValue)
        {
            var match = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?[0-9]+)");
            int val;
            if (match.Success && int.TryParse(match.Groups[1].Value, out val))
                return val;
            return defaultValue;
        }

        static double GetJsonDouble(string json, string key) { return GetJsonDouble(json, key, 0.0); }
        static double GetJsonDouble(string json, string key, double defaultValue)
        {
            var match = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?[0-9\\.]+)");
            double val;
            if (match.Success && double.TryParse(match.Groups[1].Value, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out val))
                return val;
            return defaultValue;
        }

        static bool GetJsonBool(string json, string key) { return GetJsonBool(json, key, false); }
        static bool GetJsonBool(string json, string key, bool defaultValue)
        {
            var match = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
            if (match.Success)
                return bool.Parse(match.Groups[1].Value);
            return defaultValue;
        }

        static string Escape(string s)
        {
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "");
        }
    }
}
