#include <iostream>
#include <iomanip>
using namespace std;

int main() {
	double hargaSatuan, jumlahItem, total;

	cout << "=== Program Menghitung Total Harga Pembelian ===" << endl;
	cout << "Masukkan harga satuan : Rp ";
	cin >> hargaSatuan;
	cout << "Masukkan jumlah item  : ";
	cin >> jumlahItem;

	total = hargaSatuan * jumlahItem;

	cout << fixed << setprecision(2);
	cout << "Total harga pembelian : Rp " << total << endl;

	return 0;
}
