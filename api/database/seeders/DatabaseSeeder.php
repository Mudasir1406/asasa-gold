<?php

namespace Database\Seeders;

use App\Domain\Ledger\Account;
use App\Domain\Ledger\LedgerService;
use App\Models\Account as AccountModel;
use App\Models\LedgerEntry;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Idempotent: creates the six accounts and posts the opening SEED batch once. */
class DatabaseSeeder extends Seeder
{
    public function run(LedgerService $ledger): void
    {
        DB::transaction(function () use ($ledger) {
            foreach (Account::ALL as $id) {
                AccountModel::firstOrCreate(['id' => $id], ['asset' => Account::assetOf($id)]);
            }

            if (LedgerEntry::where('kind', 'SEED')->exists()) {
                return;
            }

            $postings = [];
            $offsets = [Account::EXTERNAL_CASH => 0, Account::EXTERNAL_GOLD => 0];
            foreach (Account::SEED as $id => $amount) {
                $postings[] = ['account' => $id, 'amount' => $amount];
                $external = Account::assetOf($id) === Account::ASSET_PKR ? Account::EXTERNAL_CASH : Account::EXTERNAL_GOLD;
                $offsets[$external] -= $amount;
            }
            foreach ($offsets as $id => $amount) {
                $postings[] = ['account' => $id, 'amount' => $amount];
            }

            $ledger->post('SEED', null, $postings);
        });
    }
}
