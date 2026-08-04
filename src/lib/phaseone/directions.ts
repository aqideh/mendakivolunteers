export type DirectionsLinks = Readonly<{
  appleMaps: string;
  googleMaps: string;
}>;

export function buildDirectionsLinks(destination: string): DirectionsLinks {
  const trimmedDestination = destination.trim();
  if (!trimmedDestination) {
    throw new Error("A navigation destination is required.");
  }

  const encodedDestination = encodeURIComponent(trimmedDestination);

  return {
    appleMaps: `https://maps.apple.com/?daddr=${encodedDestination}`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encodedDestination}`,
  };
}
