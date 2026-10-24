#include <iostream>
using namespace std;

int main() {
	string nama;
	double nilaiTugas, nilaiUts, nilaiUas, rataRata;

	cout << "=== Program Menghitung Nilai Rata-rata Mahasiswa ===" << endl;
	cout << "Masukkan nama mahasiswa : ";
	getline(cin, nama);
	cout << "Masukkan nilai tugas    : ";
	cin >> nilaiTugas;
	cout << "Masukkan nilai UTS      : ";
	cin >> nilaiUts;
	cout << "Masukkan nilai UAS      : ";
	cin >> nilaiUas;

	rataRata = (nilaiTugas + nilaiUts + nilaiUas) / 3;

	cout << "Nama       : " << nama << endl;
	cout << "Rata-rata  : " << rataRata << endl;

	if (rataRata >= 75) {
		cout << "Status     : Lulus" << endl;
	} else {
		cout << "Status     : Tidak lulus" << endl;
	}

	return 0;
}
