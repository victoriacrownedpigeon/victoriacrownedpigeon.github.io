(function() {
    const highResUrl = 'images/twycrosszoo_org.webp';
    const tempImage = new Image();

    tempImage.src = highResUrl;

    tempImage.onload = function() {
        document.body.classList.add('bg-loaded');
        console.log("Background optimized: High-res image loaded.");
    };
})();