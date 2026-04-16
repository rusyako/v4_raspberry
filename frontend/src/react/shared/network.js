export function ensureNetworkWarmup() {
  const head = document.head;
  if (!head) {
    return;
  }

  const origin = window.location.origin;

  if (!document.querySelector(`link[data-smartbox-preconnect="${origin}"]`)) {
    const preconnectLink = document.createElement('link');
    preconnectLink.rel = 'preconnect';
    preconnectLink.href = origin;
    preconnectLink.setAttribute('data-smartbox-preconnect', origin);
    head.appendChild(preconnectLink);
  }

  if (!document.querySelector(`link[data-smartbox-dnsprefetch="${origin}"]`)) {
    const dnsPrefetchLink = document.createElement('link');
    dnsPrefetchLink.rel = 'dns-prefetch';
    dnsPrefetchLink.href = origin;
    dnsPrefetchLink.setAttribute('data-smartbox-dnsprefetch', origin);
    head.appendChild(dnsPrefetchLink);
  }
}

export function preloadImages(imageSources) {
  imageSources.forEach((src) => {
    if (!src) {
      return;
    }

    const image = new Image();
    image.decoding = 'async';
    image.src = src;
  });
}
