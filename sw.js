self.addEventListener("install", () => {
    console.log("Service Worker installed");
    self.skipWaiting();
});

self.addEventListener("activate", () => {
    console.log("Service Worker activated");
});

self.addEventListener("fetch", () => {
    // offline cache 없이 단순 구조 유지
});