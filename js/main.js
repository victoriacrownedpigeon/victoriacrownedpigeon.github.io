// favicon animation
const icons = [
  "/favicons/fav0.png",
  "/favicons/fav1.png",
  "/favicons/fav2.png",
  "/favicons/fav3.png"
];

function iconChange() {
  const icon = document.getElementById("icon");
  if (!icon) return;

  setTimeout(() => icon.href = icons[0], 250);
  setTimeout(() => icon.href = icons[1], 500);
  setTimeout(() => icon.href = icons[2], 750);
  setTimeout(() => icon.href = icons[3], 1000);
}

window.onload = function() {
  setInterval(iconChange, 100);
};

// circles animation
var sketchProc = function(processingInstance) {
    processingInstance.size(400, 400);
    processingInstance.frameRate(30);

    var xPositions = [];
    var yPositions = [];
    var speed = [];
    var colors = [];
    var numbers = [];

    for (var i = 0; i < 10; i++) {
        xPositions.push(processingInstance.random(0, 400));
        yPositions.push(0);
        speed.push(processingInstance.random(2, 4));
        colors.push(processingInstance.color(
            processingInstance.random(0, 255), 
            processingInstance.random(0, 255), 
            processingInstance.random(0, 255)
        ));
        numbers.push(processingInstance.floor(processingInstance.random(0, 9)));
    }

    processingInstance.mouseClicked = function() {
        xPositions.push(processingInstance.mouseX);
        yPositions.push(processingInstance.mouseY);
        speed.push(processingInstance.random(2, 4));
        colors.push(processingInstance.color(
            processingInstance.random(0, 255), 
            processingInstance.random(0, 255), 
            processingInstance.random(0, 255)
        ));
        numbers.push(processingInstance.floor(processingInstance.random(0, 9)));
    };

    processingInstance.draw = function() {
        processingInstance.background(169, 169, 169);
        for (var i = 0; i < xPositions.length; i++) {
            processingInstance.noStroke();
            processingInstance.fill(colors[i]);
            processingInstance.ellipse(xPositions[i], yPositions[i], 25, 25);
            processingInstance.fill(250, 250, 250);
            processingInstance.textSize(20);
            processingInstance.text(numbers[i], xPositions[i] - 5, yPositions[i] + 7);
            yPositions[i] += speed[i];
            if (yPositions[i] > 400) {
                yPositions[i] = 0;
            }
        }
    };
};

var canvas = document.getElementById("mycanvas");
var processingInstance = new Processing(canvas, sketchProc);