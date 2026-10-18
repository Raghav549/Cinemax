import type { ImgHTMLAttributes } from "react";

/**
 * Creator-controlled artwork can use arbitrary HTTPS hosts or MiLey's protected
 * image route. Keep it browser-loaded instead of asking Next's server optimizer
 * to fetch untrusted remote URLs, and avoid sending the current page as a referrer.
 */
/* eslint-disable @next/next/no-img-element */
type RemoteImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & { alt: string };

export default function RemoteImage(props: RemoteImageProps) {
  const { alt, loading = "lazy", decoding = "async", referrerPolicy = "no-referrer", ...imageProps } = props;
  return <img {...imageProps} alt={alt} loading={loading} decoding={decoding} referrerPolicy={referrerPolicy} />;
}
