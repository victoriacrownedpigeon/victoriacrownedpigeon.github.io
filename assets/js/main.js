const faviconManager = {
    icons: [
        "assets/images/favicons/fav0.png",
        "assets/images/favicons/fav1.png",
        "assets/images/favicons/fav2.png",
        "assets/images/favicons/fav3.png"
    ],
    index: 0,
    init: function() {
        const iconLink = document.getElementById("icon");
        if (!iconLink) return;

        setInterval(() => {
            this.index = (this.index + 1) % this.icons.length;
            iconLink.href = this.icons[this.index];
        }, 120);
    }
};

const backgroundManager = {
    highResUrl: 'assets/images/backgrounds/twycrosszoo_org.webp',
    init: function() {
        const tempImage = new Image();
        tempImage.src = this.highResUrl;
        tempImage.onload = () => {
            document.body.classList.add('bg-loaded');
            console.log("Background optimized: High-res image loaded.");
        };
    }
};

window.onload = function() {
    faviconManager.init();
    backgroundManager.init();
};