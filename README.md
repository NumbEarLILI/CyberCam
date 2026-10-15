# CyberCam

浏览器里的胶片相机。快门先把画面存成 16-bit 线性 RAW（`.filmraw`），再按所选机身的光学和胶卷显影。

取景已经套上风格，方便构图。RAW 文件本身不含暗角、裁切和胶卷颜色。同一张 RAW 可以换机身或胶卷重新显影。

## 开发

```bash
npm install
npm test
npm run dev
```

没有摄像头时用「试拍场景」，或导入一张照片，一样会先写 RAW 再显影。
