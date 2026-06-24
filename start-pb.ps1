$pbBin = if ($env:POCKETBASE_BIN) { $env:POCKETBASE_BIN } else { "$PSScriptRoot\pocketbase\pocketbase.exe" }
& $pbBin serve --dir ./pb_data --migrationsDir ./pb_migrations
