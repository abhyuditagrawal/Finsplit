// Empty service worker
self.addEventListener('install', function(event) {
  console.log('Service Worker installed');
});

self.addEventListener('fetch', function(event) {
  // Do nothing - just let requests pass through
});
