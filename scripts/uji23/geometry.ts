// Fixture TypeScript for verify23. Three errors so the $tsc matcher
// yields three Problems, one of them TS2322 exactly on line 12.

type Titik = { x: number; y: number };

export function geser(p: Titik, dx: number, dy: number): Titik {
  return { x: p.x + dx, y: p.y + dy };
}

export const asal: Titik = { x: 0, y: 0 };

export const salah: Titik = { x: 'bukan angka' };

export function jumlah(a: number, b: number): number {
  return a + b;
}

export const label: string = 42;

export function panggil(): void {
  jumlah('satu', 2);
}
