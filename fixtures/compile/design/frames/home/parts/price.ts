export type Price = { amount: number; currency: "SEK" };

export const formatPrice = ({ amount, currency }: Price): string => `${amount} ${currency.toLowerCase()}`;
