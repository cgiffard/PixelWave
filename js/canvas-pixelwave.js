function PixelCanvas(sourceImage,destinationElement,repaintCallback) {
	"use strict";

	// Tweakable
	var pixelSizeX = 30;
	var pixelSizeY = 30;
	var borderWidth = 0;
	var waveAmplitude = 1;
	var horizontalGravity = "right";
	var verticalGravity = "bottom";
	var renderFramerate = 10;
	var initialIntensity = 0;
	var increaseIntensityByPercentage = 1;

	// Initialise parameters
	var canvas = destinationElement instanceof HTMLCanvasElement ? destinationElement : document.createElement("canvas");
	var context = null;
	var usingWebkitCanvasMethod = false;
	var initialised = false;
	var apiInterface = {};
	var canvasID = "";

	// Variables for calculating image draw dimensions
	var outputCanvasHeight, outputCanvasWidth,
		sourceImageHeight, sourceImageWidth,
		inputAspectRatio, outputAspectRatio,
		imageDrawWidth, imageDrawHeight,
		renderConditionsMatched, sizingPassCount = 0,
		renderDeltaX, renderDeltaY,
		imageDrawOffsetX = 0, imageDrawOffsetY = 0;
	
	// Variables for calculating pixel overlay data
	var pixelX, pixelY, overlayPixelX, overlayPixelY, isBorder, subPixelX, subPixelY;

	// State for effect
	var effectOffset = 0, calculatedAlpha, frameInterval, currentIntensity = initialIntensity;
	
	// Datastores...
	var imagePixelData, imagePixels = [], averagedPixels = [];

	// Get something together for animation
	var requestAnimFrame = (function(){
		return window.requestAnimationFrame		|| 
			window.webkitRequestAnimationFrame	|| 
			window.mozRequestAnimationFrame		|| 
			window.oRequestAnimationFrame		|| 
			window.msRequestAnimationFrame		|| 
			function(callback, element){
				return window.setTimeout(callback, Math.floor(1000/renderFramerate));
			};
    })();
    console.log(requestAnimFrame);
	function generateID(stringLength) {
		var idComposite = "";
		stringLength = stringLength ? stringLength : 10;
		while (idComposite.length < stringLength) {
			idComposite += String.fromCharCode(65 + Math.floor(Math.random()*26));
		}
	
		return "pixelWaveCanvas" + idComposite;
	}

	function readyContext() {
		// Ensure all our resources are ready
		if (!(context = canvas.getContext("2d")) ||
			!(destinationElement && destinationElement instanceof HTMLElement) || 
			!(sourceImage instanceof HTMLImageElement && sourceImage.complete !== false)) {
			throw new Error("Couldn't initialise pixel wave.");
		}

		// If we can, draw directly to element bg
		if (canvas !== destinationElement) {
			if (document.getCSSCanvasContext) {
				canvasID = generateID(20);
				destinationElement.style.backgroundImage = "-webkit-canvas(" + canvasID + ")";
				context = document.getCSSCanvasContext("2d", canvasID, destinationElement.offsetWidth, destinationElement.offsetHeight);
				usingWebkitCanvasMethod = true;
			}
		}

		return apiInterface;
	}

	function calculateDrawMetrics() {
		// Get output rendering dimensions
		outputCanvasHeight = destinationElement.offsetHeight;
		outputCanvasWidth = destinationElement.offsetWidth;
		outputAspectRatio = outputCanvasWidth / outputCanvasHeight;
		console.log("Rendering to %sx%s area. Aspect %s",outputCanvasHeight,outputCanvasWidth,outputAspectRatio);

		// Get input rendering dimensions
		sourceImageWidth = sourceImage.width;
		sourceImageHeight = sourceImage.height;
		inputAspectRatio = sourceImageWidth / sourceImageHeight;
		console.log("Rendering from %sx%s source. Aspect %s",sourceImageWidth,sourceImageHeight,inputAspectRatio);

		// Assign dimensions back to canvas
		// (if we're not rendering directly into a canvas, that is);
		if (destinationElement !== canvas) {
			canvas.height = outputCanvasHeight;
			canvas.width = outputCanvasWidth;
		}

		// Calculate image draw dimensions
		// Set up initials for first pass
		renderConditionsMatched = false;
		imageDrawHeight = sourceImageHeight;
		imageDrawWidth = sourceImageWidth;

		// Initialise loop. If we haven't found our desired result in five passes, bail out
		while (!renderConditionsMatched && sizingPassCount < 5) {
			if (outputCanvasHeight * outputCanvasWidth > imageDrawHeight * imageDrawWidth) {

				// Destination larger
				if (outputCanvasHeight - imageDrawHeight > outputCanvasWidth - imageDrawWidth) {
					// Height delta greater than width delta
					imageDrawHeight = outputCanvasHeight;
					imageDrawWidth = Math.ceil(imageDrawHeight*inputAspectRatio);
				} else {
					// Width delta greater than height delta
					imageDrawWidth = outputCanvasWidth;
					imageDrawHeight = Math.ceil(imageDrawWidth/inputAspectRatio);
				}
			} else {

				// Source larger
				if (imageDrawHeight - outputCanvasHeight > imageDrawWidth - outputCanvasWidth) {
					
					// Height delta greater than width delta
					imageDrawHeight = outputCanvasHeight;
					imageDrawWidth = Math.ceil(imageDrawHeight*inputAspectRatio);
				} else {
					
					// Width delta greater than height delta
					imageDrawWidth = outputCanvasWidth;
					imageDrawHeight = Math.ceil(imageDrawWidth/inputAspectRatio);
				}
			}

			// Check render deltas - convert signed integers into unsigned for ease of comparison
			renderDeltaX = (imageDrawWidth - outputCanvasWidth) >>> 0;
			renderDeltaY = (imageDrawHeight - outputCanvasHeight) >>> 0;

			// Have we resized the image so it fills the canvas as best we can?
			renderConditionsMatched = (
				((imageDrawWidth * imageDrawHeight) >= (outputCanvasWidth * outputCanvasHeight)) &&
				((renderDeltaX === 0) || (renderDeltaY === 0))
			);
		}

		// Calculate draw offset from gravity
		// Defaults are 0,0, which correspond to top and left gravities
		// Only recalculate if we have right / bottom gravities set
		if (horizontalGravity === "right") {
			imageDrawOffsetX = renderDeltaX ? renderDeltaX *-1 : 0;
		}

		if (verticalGravity === "bottom") {
			imageDrawOffsetY = renderDeltaY ? renderDeltaY*-1 : 0;
		}

		return apiInterface;
	}

	function getAveragedPixels() {
		context.drawImage(sourceImage,imageDrawOffsetX,imageDrawOffsetY,imageDrawWidth,imageDrawHeight);
		imagePixelData = context.getImageData(0, 0, outputCanvasWidth, outputCanvasHeight);
		imagePixels = imagePixelData.data;

		// Grab cumulative colour values from larger pixels
		for (var pixelIndex = 0; pixelIndex < (imagePixels.length/4); pixelIndex++) {
			// Get XY for pixel...
			pixelY = Math.floor(pixelIndex / outputCanvasWidth);
			pixelX = pixelIndex - (outputCanvasWidth * pixelY);

			// What 'overlay', or larger pixel are we in?
			overlayPixelX = Math.floor(pixelX / (borderWidth + pixelSizeX));
			overlayPixelY = Math.floor(pixelY / (borderWidth + pixelSizeY));

			// And what is our relative subpixel position inside it?
			subPixelX = pixelX % overlayPixelX;
			subPixelY = pixelY % overlayPixelY;

			// Are we on a border?
			isBorder = subPixelX > pixelSizeX || subPixelY > pixelSizeY;

			// Don't get the colour average if we're on a border
			if (!isBorder) {
				if (!averagedPixels[overlayPixelX]) {
					averagedPixels[overlayPixelX] = [];
				}

				if (!averagedPixels[overlayPixelX][overlayPixelY]) {
					averagedPixels[overlayPixelX][overlayPixelY] = {
						"red": 0,
						"green": 0,
						"blue": 0,
						"count": 0
					};
				}

				averagedPixels[overlayPixelX][overlayPixelY]["red"]		+= imagePixels[(pixelIndex * 4)];
				averagedPixels[overlayPixelX][overlayPixelY]["green"]	+= imagePixels[(pixelIndex * 4) + 1];
				averagedPixels[overlayPixelX][overlayPixelY]["blue"]	+= imagePixels[(pixelIndex * 4) + 2];
				averagedPixels[overlayPixelX][overlayPixelY]["count"]	++;
			}
		}

		averagedPixels.forEach(function(item,Xindex) {
			item.forEach(function(subitem,Yindex) {
				subitem.red = Math.floor(subitem.red / subitem.count);
				subitem.green = Math.floor(subitem.green / subitem.count);
				subitem.blue = Math.floor(subitem.blue / subitem.count);
			});
		});

		return apiInterface;
	}

	function redrawPixels() {
		context.drawImage(sourceImage,imageDrawOffsetX,imageDrawOffsetY,imageDrawWidth,imageDrawHeight);
		averagedPixels.forEach(function(col,xIndex) {
			col.forEach(function(pixel,yIndex) {
				var distanceAcross = 1 - ((xIndex*(pixelSizeX+borderWidth))/outputCanvasWidth);
				calculatedAlpha = (Math.sin((yIndex/10)+effectOffset)+1) * distanceAcross + (distanceAcross/4);
				calculatedAlpha = calculatedAlpha > 1 ? 1 : calculatedAlpha;

				// Intensity modifier - to get a nice fade in when we start
				calculatedAlpha = (calculatedAlpha/100) * currentIntensity;

				context.fillStyle = "rgba(" + pixel.red + "," + pixel.green + "," + pixel.blue + "," + calculatedAlpha + ")";
				context.fillRect(xIndex * (pixelSizeX + borderWidth), yIndex * (pixelSizeY + borderWidth), pixelSizeX, pixelSizeY);

				calculatedAlpha = distanceAcross * (calculatedAlpha*2);
				context.fillStyle = "rgba(" + Math.floor(pixel.red/2) + "," + Math.floor(pixel.green/2) + "," + Math.floor(pixel.blue/2) + "," + calculatedAlpha + ")";
				context.fillRect((xIndex * (pixelSizeX + borderWidth)) + pixelSizeX, (yIndex * (pixelSizeY + borderWidth)), borderWidth,pixelSizeY);
				context.fillRect((xIndex * (pixelSizeX + borderWidth)), (yIndex * (pixelSizeY + borderWidth)) + pixelSizeY, pixelSizeX + borderWidth,borderWidth);
			});
		});

		effectOffset = effectOffset > 100 ? 0 : effectOffset + 0.05;

		if (!usingWebkitCanvasMethod) {
			destinationElement.style.backgroundImage = "url('" + canvas.toDataURL() + "')";
		}
		
		if (typeof(repaintCallback) === "function") {
			repaintCallback(context);
		}
		
		if (currentIntensity < 100) {
			currentIntensity = currentIntensity + increaseIntensityByPercentage > 100 ? 100 : currentIntensity + increaseIntensityByPercentage;
		}

		requestAnimFrame(redrawPixels,canvas);
		return apiInterface;
	}

	// INITIALISE
	function init() {
		if (!initialised) {
			readyContext();
			calculateDrawMetrics();
			getAveragedPixels();
			redrawPixels();
			frameInterval = requestAnimFrame(redrawPixels,canvas);
			initialised = true;
		}
		
		return apiInterface;
	}

	// window.addEventListener("resize",function(eventData) {
	// 	// window.clearInterval(frameInterval);
		
	// 	calculateDrawMetrics();
	// 	getAveragedPixels();
	// 	// redrawPixels();

	// 	// frameInterval = window.setInterval(redrawPixels,Math.floor(1000/renderFramerate));
	// });

	apiInterface = {
		"init": init,
		"readyContext": readyContext,
		"calculateDrawMetrics": calculateDrawMetrics,
		"getAveragedPixels": getAveragedPixels,
		"stop": function() {
			window.clearTimeout(frameInterval);

			return apiInterface;
		},
		"start": function() {
			frameInterval = requestAnimFrame(redrawPixels,canvas);

			return apiInterface;
		},
		"setCallback": function(callback) {
			repaintCallback = typeof(callback) === "function" ? callback : repaintCallback;

			return apiInterface;
		},
		"getWidth": function() {
			return outputCanvasWidth;
		},
		"getHeight": function() {
			return outputCanvasHeight;
		},
		"setStyle": function(styleObject) {
			if (styleObject instanceof Object) {
				if (styleObject["pixelWidth"] && !isNaN(styleObject["pixelWidth"])) {
					pixelSizeX = styleObject["pixelWidth"];
				}

				if (styleObject["pixelHeight"] && !isNaN(styleObject["pixelHeight"])) {
					pixelSizeY = styleObject["pixelHeight"];
				}

				if (styleObject["borderWidth"] && !isNaN(styleObject["borderWidth"])) {
					borderWidth = styleObject["borderWidth"];
				}

				return apiInterface;
			} else {
				throw new Error("Style input must be an object.");
			}
		}
	};

	return apiInterface;
}