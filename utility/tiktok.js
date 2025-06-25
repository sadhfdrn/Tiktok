const tikApi = require("@tobyg74/tiktok-api-dl");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
class TikTokDownloader {
  constructor() {
    this.watermarkStyles = {};
    this.tempDir = "./temp";
    this.loadWatermarkStyles();
    this.ensureTempDir();
  }

  loadWatermarkStyles() {
    const stylesDir = "./styles";
    try {
      if (fs.existsSync(stylesDir)) {
        const files = fs.readdirSync(stylesDir);
        for (const file of files) {
          if (file.endsWith('.js')) {
            const styleName = file.replace('.js', '');
            const StyleClass = require(`./styles/${file}`);
            this.watermarkStyles[styleName] = new StyleClass();
          }
        }
      }
    } catch (error) {
      console.error("Error loading watermark styles:", error);
    }
  }

  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async downloadVideo(url, quality = "hd", addWatermark = false, watermarkStyle = null) {
    try {
      const result = await tikApi.Downloader(url, { version: "v3" });
      
      if (result.status !== "success") {
        throw new Error("Failed to fetch TikTok data");
      }

      const videoData = result.result;
      const videoUrl = quality === "hd" ? videoData.video1 : videoData.video2;
      
      if (!videoUrl) {
        throw new Error(`${quality.toUpperCase()} quality not available`);
      }

      const filename = `tiktok_${Date.now()}.mp4`;
      const filepath = path.join(this.tempDir, filename);
      
      // Download video
      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      let finalPath = filepath;

      // Apply watermark if requested
      if (addWatermark && watermarkStyle) {
        const watermarkedPath = path.join(this.tempDir, `watermarked_${filename}`);
        const styler = this.getStyler(watermarkStyle.styleType || 'glitch');
        if (styler) {
          await styler.applyToVideo(filepath, watermarkedPath, watermarkStyle);
          fs.unlinkSync(filepath); // Remove original
          finalPath = watermarkedPath;
        }
      }

      return {
        success: true,
        path: finalPath,
        metadata: {
          title: videoData.title,
          author: videoData.author.nickname,
          duration: videoData.duration,
          quality: quality,
          watermarked: addWatermark
        }
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async downloadImages(url, quality = "hd", addWatermark = false, watermarkStyle = null) {
    try {
      const result = await tikApi.Downloader(url, { version: "v3" });
      
      if (result.status !== "success") {
        throw new Error("Failed to fetch TikTok data");
      }

      const imageData = result.result;
      
      if (!imageData.images || imageData.images.length === 0) {
        throw new Error("No images found in this TikTok");
      }

      const downloadedImages = [];
      
      for (let i = 0; i < imageData.images.length; i++) {
        const imageUrl = quality === "hd" ? imageData.images[i] : imageData.images[i]; // Adjust if different qualities available
        const filename = `tiktok_image_${Date.now()}_${i + 1}.jpg`;
        const filepath = path.join(this.tempDir, filename);
        
        const response = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'stream'
        });

        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        let finalPath = filepath;

        // Apply watermark if requested
        if (addWatermark && watermarkStyle) {
          const watermarkedPath = path.join(this.tempDir, `watermarked_${filename}`);
          const styler = this.getStyler(watermarkStyle.styleType || 'glitch');
          if (styler) {
            await styler.applyToImage(filepath, watermarkedPath, watermarkStyle);
            fs.unlinkSync(filepath);
            finalPath = watermarkedPath;
          }
        }

        downloadedImages.push(finalPath);
      }

      return {
        success: true,
        paths: downloadedImages,
        metadata: {
          title: imageData.title,
          author: imageData.author.nickname,
          count: downloadedImages.length,
          quality: quality,
          watermarked: addWatermark
        }
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getStyler(styleType) {
    return this.watermarkStyles[styleType] || this.watermarkStyles['glitch'] || null;
  }

  getPresetStyles() {
    const allPresets = {};
    Object.keys(this.watermarkStyles).forEach(styleType => {
      const styler = this.watermarkStyles[styleType];
      if (styler && typeof styler.getPresetStyles === 'function') {
        const presets = styler.getPresetStyles();
        Object.keys(presets).forEach(presetName => {
          allPresets[`${styleType}_${presetName}`] = {
            ...presets[presetName],
            styleType: styleType
          };
        });
      }
    });
    return allPresets;
  }

  async getAvailableStyles() {
    const styles = [];
    Object.keys(this.watermarkStyles).forEach(styleType => {
      const styler = this.watermarkStyles[styleType];
      if (styler) {
        styles.push({
          name: styleType,
          presets: styler.getPresetStyles ? Object.keys(styler.getPresetStyles()) : []
        });
      }
    });
    return styles;
  }

  cleanup(filePaths) {
    if (Array.isArray(filePaths)) {
      filePaths.forEach(filepath => {
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      });
    } else if (typeof filePaths === 'string') {
      if (fs.existsSync(filePaths)) {
        fs.unlinkSync(filePaths);
      }
    }
  }
}

module.exports = TikTokDownloader;
