"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
exports.createToken = createToken;
const node_crypto_1 = require("node:crypto");
function createId(prefix) {
    return `${prefix}-${(0, node_crypto_1.randomUUID)()}`;
}
function createToken(byteLength = 24) {
    return (0, node_crypto_1.randomBytes)(byteLength).toString("hex");
}
