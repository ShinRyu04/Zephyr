export const kunciPath = (p: string) => p.replace(/\//g, '\\').toLowerCase();

export const pathSama = (a: string, b: string) => kunciPath(a) === kunciPath(b);
