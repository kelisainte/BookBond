export type ListingKind = 'swap' | 'loan' | 'gift';
export type OfferKind = 'bond' | 'loan' | 'gift';

// The public listing calls a two-sided exchange a swap; the agreement calls it a Bond.
export function offerKindForListing(kind: ListingKind): OfferKind {
  return kind === 'swap' ? 'bond' : kind;
}
