const crypto = require("crypto");
const config = require("../config");

// Derive a 32-byte key from the bot token (sha256 hash)
// This ensures the key is consistent but not stored plainly in code/state
const ENCRYPTION_KEY = crypto.createHash("sha256").update(config.botToken).digest();
const IV_LENGTH = 16;
const ALGORITHM = "aes-256-ctr";

function encrypt(text) {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return "enc:" + iv.toString("hex") + ":" + encrypted.toString("hex");
    } catch (err) {
        console.error("Encryption failed:", err.message);
        return text; // Fallback to plain text on error (safer than data loss?)
    }
}

function decrypt(text) {
    if (!text) return null;

    // Check if it's encrypted
    if (!text.startsWith("enc:")) {
        return text; // Return as-is (backward compatibility)
    }

    try {
        const parts = text.split(":");
        if (parts.length !== 3) return text;

        const iv = Buffer.from(parts[1], "hex");
        const encryptedText = Buffer.from(parts[2], "hex");
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (err) {
        console.error("Decryption failed:", err.message);
        return null; // Return null on failure to avoid using garbage data
    }
}

module.exports = { encrypt, decrypt };
