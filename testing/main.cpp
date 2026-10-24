// Menghitung Luas Persegi Panjang

#include <iostream>
using namespace std;

int main() {
    float panjang;
    float lebar;
    float luas;

    cout << "Masukkan panjang: ";
    cin >> panjang;

    cout << "Masukkan lebar : ";
    cin >> lebar;

    luas = panjang * lebar;

    cout << "Hasil Perhitungan Luas: " << luas << endl;

    return 0;
}
