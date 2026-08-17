from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path('assets/icon.ico')
SIZES = [16, 20, 24, 32, 48, 64, 128, 256]

base = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
d = ImageDraw.Draw(base)
# 透明圆角奶油底，避免 Windows 小尺寸只剩一团粉色
margin = 54
d.ellipse((margin, margin, 1024-margin, 1024-margin), fill=(255, 250, 243, 255), outline=(235, 220, 208, 255), width=10)
# 番茄主体：放大、轮廓清晰，适合任务栏缩小
red = (221, 104, 91, 255)
red_hi = (238, 133, 117, 255)
red_shadow = (188, 75, 68, 255)
d.ellipse((238, 312, 786, 827), fill=red_shadow)
d.ellipse((222, 291, 786, 805), fill=red)
d.ellipse((270, 333, 730, 755), fill=red_hi)
d.ellipse((318, 376, 432, 503), fill=(255, 218, 199, 190))
# 叶片与蒂部
leaf_dark = (76, 119, 78, 255)
leaf = (103, 145, 93, 255)
leaf_light = (140, 172, 116, 255)
d.polygon([(504, 376), (424, 210), (494, 244), (510, 132), (550, 256), (649, 180), (624, 328)], fill=leaf_dark)
d.ellipse((382, 199, 535, 342), fill=leaf)
d.ellipse((493, 132, 614, 325), fill=leaf_dark)
d.ellipse((594, 178, 744, 347), fill=leaf)
d.polygon([(503, 331), (516, 256), (539, 331)], fill=leaf_light)
# 多尺寸高质量缩放
images = []
for size in SIZES:
    img = base.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 24:
        # 小尺寸去掉过细高光，让番茄轮廓更清楚
        pix = img.load()
        for y in range(size):
            for x in range(size):
                r, g, b, a = pix[x, y]
                if a and r > 245 and g > 180 and b > 160:
                    pix[x, y] = (255, 240, 228, a)
    images.append(img)
images[-1].save(OUT, format='ICO', sizes=[(s, s) for s in SIZES])
print(f'generated {OUT} with sizes: {SIZES}')
