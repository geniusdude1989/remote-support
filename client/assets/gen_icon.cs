using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

namespace IconGenerator
{
    class Program
    {
        static void Main(string[] args)
        {
            string outPath = args.Length > 0 ? args[0] : @"h:\rdp\client\assets\icon.ico";
            using (Bitmap bmp = new Bitmap(256, 256))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);

                    using (var brush = new System.Drawing.Drawing2D.LinearGradientBrush(
                        new Point(0, 0), new Point(256, 256),
                        Color.FromArgb(239, 68, 68), Color.FromArgb(249, 115, 22)))
                    {
                        g.FillEllipse(brush, 10, 10, 236, 236);
                    }

                    Point[] points = new Point[] {
                        new Point(140, 40),
                        new Point(85, 135),
                        new Point(125, 135),
                        new Point(110, 215),
                        new Point(175, 120),
                        new Point(135, 120),
                        new Point(155, 40)
                    };
                    using (var wb = new SolidBrush(Color.White))
                    {
                        g.FillPolygon(wb, points);
                    }
                }

                byte[] pngBytes;
                using (MemoryStream ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Png);
                    pngBytes = ms.ToArray();
                }

                using (FileStream fs = new FileStream(outPath, FileMode.Create))
                {
                    BinaryWriter bw = new BinaryWriter(fs);
                    bw.Write((ushort)0); // reserved
                    bw.Write((ushort)1); // icon type
                    bw.Write((ushort)1); // 1 image
                    bw.Write((byte)0);   // width 0 -> 256px
                    bw.Write((byte)0);   // height 0 -> 256px
                    bw.Write((byte)0);   // color count
                    bw.Write((byte)0);   // reserved
                    bw.Write((ushort)1); // planes
                    bw.Write((ushort)32);// bpp
                    bw.Write((uint)pngBytes.Length);
                    bw.Write((uint)22);  // offset
                    bw.Write(pngBytes);
                }
            }
            Console.WriteLine("256x256 icon.ico generated successfully at " + outPath);
        }
    }
}
