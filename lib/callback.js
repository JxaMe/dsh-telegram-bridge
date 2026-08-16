export function encodeData(parts) {
    return parts.map((part) => encodeURIComponent(part)).join('|');
}
export function decodeData(data) {
    return data.split('|').map((part) => decodeURIComponent(part));
}
