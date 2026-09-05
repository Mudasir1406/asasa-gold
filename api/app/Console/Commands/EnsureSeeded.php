<?php

namespace App\Console\Commands;

use App\Domain\Ledger\LedgerService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Console\Command;

/**
 * Runs on container boot after migrations. DatabaseSeeder is idempotent, so a
 * redeploy against an existing database leaves the reviewer's balances alone.
 */
class EnsureSeeded extends Command
{
    protected $signature = 'app:ensure-seeded';

    protected $description = 'Post the opening balances if the ledger has never been seeded';

    public function handle(LedgerService $ledger, DatabaseSeeder $seeder): int
    {
        $this->getLaravel()->call([$seeder, 'run']);

        $balances = $ledger->balances();
        $this->info(sprintf(
            'Ledger ready — wallet %s, holdings %s, inventory %s, integrity %s',
            $balances['customer_cash_paisa'],
            $balances['customer_gold_mg'],
            $balances['platform_gold_mg'],
            $ledger->integrity()['ok'] ? 'ok' : 'FAILED',
        ));

        return self::SUCCESS;
    }
}
