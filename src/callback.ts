export function encodeData(parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join('|');
}

export function decodeData(data: string): string[] {
  return data.split('|').map((part) => decodeURIComponent(part));
}
