# 私有 OG 字体

来源与哈希记录在 source.json，授权文本为 OFL.txt。运行时不下载字体或补字，不向第三方发送文档文字。

资产是官方源的静态 400 字重派生，不作语言子集裁剪；glyph-ranges.json 取派生字体 cmap 的 Unicode 范围。重建使用临时 fontTools 4.67.0，项目构建和运行均不依赖 Python：

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont("source.ttf", recalcTimestamp=False)
instantiateVariableFont(font, {"wght": 400}, inplace=True, optimize=True)
font.save("noto-sans-sc.ttf")
```

更新字体时同时重建 cmap 范围、来源记录和 SHA-256，并验证中文图像、取消和生产打包。
