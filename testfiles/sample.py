# Berkas uji fase 03 — cek syntax highlight Python.
from dataclasses import dataclass


@dataclass
class Titik:
    x: float
    y: float

    def jarak(self) -> float:
        """Hitung jarak dari titik asal."""
        return (self.x**2 + self.y**2) ** 0.5


def utama() -> None:
    titik = [Titik(3, 4), Titik(1, 1)]
    for t in titik:
        print(f"jarak {t} = {t.jarak():.3f}")


if __name__ == "__main__":
    utama()
