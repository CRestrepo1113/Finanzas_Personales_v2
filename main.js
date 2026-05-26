import { UI } from './js/ui.js';
import { State } from './js/state.js';
import { Analytics } from './js/analytics.js';
import { ImportService } from './js/import.js';
import { FormService } from './js/forms.js';
import { CurrencyService } from './js/currency.js';
import { ZBBService } from './js/zbb.js';
import { CalculatorService } from './js/calculator.js';
import { DriveService } from './js/drive.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Finanzas Personales v2: Inicializando...');
    
    // 1. Inicializar Estado (Asíncrono)
    await State.init();

    // 2. Inicializar UI y otros servicios
    UI.init();
    Analytics.init();
    ImportService.init();
    FormService.init();
    ZBBService.init();
    CalculatorService.init();

    // Actualizar divisas al inicio (sin bloquear la carga)
    CurrencyService.updateRates();

    // Configurar navegación
    setupNavigation();

    // 3. Sincronización automática silenciosa con Google Drive si corresponde
    if (DriveService.isConnected() && DriveService.getAutoSync()) {
        console.log("Drive: Sincronización automática activa al inicio...");
        setTimeout(() => {
            DriveService.sync(false).catch(err => {
                console.error("Fallo en la sincronización automática inicial:", err);
            });
        }, 2000);
    }
});

// Exponer FormService y CurrencyService globalmente para la UI y servicios cruzados
window.FormService = FormService;
window.CurrencyService = CurrencyService;

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            views.forEach(v => {
                if (v.id === target) {
                    v.classList.remove('hidden');
                    v.classList.add('active');
                } else {
                    v.classList.add('hidden');
                    v.classList.remove('active');
                }
            });
        });
    });
}
