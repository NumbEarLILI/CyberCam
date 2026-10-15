# CyberCam

浏览器里的胶片相机。快门先把画面存成 16-bit 线性 RAW（`.filmraw`），再按所选机身的光学和胶卷显影。

取景已经套上风格，方便构图。RAW 文件本身不含暗角、裁切和胶卷颜色。同一张 RAW 可以换机身或胶卷重新显影。

## 开发

```bash
npm install
npm test
npm run dev
```

没有摄像头时可以导入一张照片，一样会先写 RAW 再显影。顶部按钮留在状态栏下面。取景画面上显示当前机身、胶卷、曝光补偿、ISO、快门、光圈和摄像头。ISO 跟着胶卷的标称感光度走，快门和光圈每次一档；三者都会改变这张的曝光，ISO 高于胶卷时颗粒也会加重。手机上如果有多颗后置镜头，列表会分开显示；系统把它们藏在同一个后置摄像头后面时，应用会直接打开对应的那一颗。画面可以双指、滚轮或按钮在 1× 到 4× 之间缩放，快门按取景里看到的范围写入 RAW。竖屏时画幅跟着转成竖幅，并尽量用摄像头的原始 4:3 高分辨率。横屏时快门移到画面右侧。

## Android release

工程在 `android/`，应用 ID 是 `app.cybercam.android`。签名配置在 `android/keystore.properties`，这把钥匙只用于当前仓库的 release 包。上架 Play Store 前请换成自己的钥匙。

```bash
npm install
npm run android:release
```

产物是 `android/app/build/outputs/apk/release/app-release.apk`。推送 `v*` 标签后，GitHub Actions 会用同一套签名打 APK 并发布到 Releases。手机上保存 RAW 或成片时，会打开系统分享。
