export function drawBenchScene(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  sky.addColorStop(0, "#6b9ed0");
  sky.addColorStop(0.45, "#c9d8e6");
  sky.addColorStop(1, "#f0e2cc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const sunX = width * 0.8;
  const sunY = height * 0.16;
  const glow = ctx.createRadialGradient(sunX, sunY, width * 0.02, sunX, sunY, width * 0.28);
  glow.addColorStop(0, "rgba(255, 246, 214, 0.95)");
  glow.addColorStop(1, "rgba(255, 246, 214, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height * 0.6);
  ctx.fillStyle = "#fff7dc";
  ctx.beginPath();
  ctx.arc(sunX, sunY, width * 0.042, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(width * 0.22, height * 0.2, width * 0.09, height * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(width * 0.3, height * 0.18, width * 0.06, height * 0.028, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e7d3b4";
  ctx.fillRect(0, height * 0.46, width * 0.26, height * 0.54);
  ctx.fillStyle = "#d86a4e";
  ctx.fillRect(width * 0.2, height * 0.36, width * 0.22, height * 0.64);
  ctx.fillStyle = "#243044";
  ctx.fillRect(width * 0.38, height * 0.28, width * 0.16, height * 0.72);

  ctx.fillStyle = "#f4efe4";
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      ctx.fillRect(width * 0.05 + col * width * 0.07, height * 0.52 + row * height * 0.07, width * 0.04, height * 0.04);
    }
  }
  ctx.fillStyle = "#8fd0ea";
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      ctx.fillRect(width * 0.24 + col * width * 0.09, height * 0.42 + row * height * 0.07, width * 0.045, height * 0.04);
    }
  }
  ctx.fillStyle = "#f2c14a";
  ctx.fillRect(width * 0.42, height * 0.4, width * 0.08, height * 0.07);

  ctx.fillStyle = "#c9b295";
  ctx.fillRect(0, height * 0.74, width, height * 0.26);
  ctx.fillStyle = "#b7a184";
  ctx.fillRect(0, height * 0.74, width, height * 0.02);

  ctx.fillStyle = "#1e6b3d";
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.5, width * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#185734";
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.54, width * 0.07, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6a4a32";
  ctx.fillRect(width * 0.755, height * 0.58, width * 0.018, height * 0.16);

  const personX = width * 0.34;
  ctx.fillStyle = "#c4473a";
  roundRect(ctx, personX - width * 0.045, height * 0.58, width * 0.09, height * 0.12, 12);
  ctx.fill();
  ctx.fillStyle = "#31486f";
  ctx.fillRect(personX - width * 0.03, height * 0.69, width * 0.024, height * 0.1);
  ctx.fillRect(personX + width * 0.006, height * 0.69, width * 0.024, height * 0.1);
  ctx.fillStyle = "#2a211c";
  ctx.beginPath();
  ctx.arc(personX, height * 0.545, width * 0.038, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#e4b08d";
  ctx.beginPath();
  ctx.arc(personX, height * 0.56, width * 0.034, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a211c";
  ctx.beginPath();
  ctx.arc(personX - width * 0.012, height * 0.552, width * 0.004, 0, Math.PI * 2);
  ctx.arc(personX + width * 0.012, height * 0.552, width * 0.004, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ef5a4c";
  ctx.beginPath();
  ctx.arc(width * 0.58, height * 0.8, width * 0.028, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c84b";
  ctx.beginPath();
  ctx.ellipse(width * 0.64, height * 0.8, width * 0.03, width * 0.016, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f8d4e";
  ctx.beginPath();
  ctx.arc(width * 0.52, height * 0.81, width * 0.026, 0, Math.PI * 2);
  ctx.fill();

  const patches = ["#111111", "#7d7d7d", "#f2f2f2", "#e4b08d", "#d84b3c", "#2f8a45", "#2d5fbe", "#f0c53a"];
  patches.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(width * 0.08 + index * width * 0.105, height * 0.9, width * 0.09, height * 0.07);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
