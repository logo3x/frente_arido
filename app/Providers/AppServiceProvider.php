<?php

namespace App\Providers;

use Illuminate\Support\Carbon;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // El sitio es solo en español: mensajes de validación (lang/es) y fechas relativas («hace 5 minutos»),
        // aunque APP_LOCALE siga en «en».
        app()->setLocale('es');
        Carbon::setLocale('es');
    }
}
