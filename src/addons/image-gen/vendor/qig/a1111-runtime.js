export const A1111_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

export function normalizeA1111BaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
}
