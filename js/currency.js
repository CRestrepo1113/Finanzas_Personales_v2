import { State } from './state.js';

export const CurrencyService = {
    // Usaremos ExchangeRate-API (gratuita, libre y soporta COP/RUB/HNL/CRC)
    API_URL: 'https://open.er-api.com/v6/latest',
    CACHE_TTL_MS: 12 * 60 * 60 * 1000, // 12 horas

    async updateRates(force = false) {
        if (!State.db || !State.db.settings) return false;

        const base = State.db.settings.baseCurrency || 'USD';
        const lastUpdated = State.db.settings.ratesLastUpdated;

        // Comprobar si las tasas en caché aún son válidas según el TTL
        if (!force && lastUpdated) {
            const age = Date.now() - new Date(lastUpdated).getTime();
            if (age < this.CACHE_TTL_MS && State.db.settings.exchangeRates) {
                console.log(`Currency: Tasas vigentes en caché (${Math.round(age / (60 * 1000))} min de antigüedad).`);
                return true;
            }
        }

        console.log(`Currency: Actualizando tasas con base en ${base}...`);

        try {
            const response = await fetch(`${this.API_URL}/${base}`);
            if (!response.ok) throw new Error('Error al consultar la API de divisas');
            
            const data = await response.json();
            
            if (data.result !== 'success') {
                throw new Error('La API respondió con un estado fallido');
            }
            
            // Actualizar las tasas que recibamos
            const newRates = { ...State.db.settings.exchangeRates };
            
            Object.keys(data.rates).forEach(currency => {
                if (newRates.hasOwnProperty(currency) || ['EUR', 'USD', 'COP', 'RUB', 'HNL', 'CRC'].includes(currency)) {
                    const rateVal = parseFloat(data.rates[currency]);
                    if (rateVal && rateVal > 0) {
                        newRates[currency] = rateVal;
                    }
                }
            });
            
            State.db.settings.ratesLastUpdated = new Date().toISOString();
            State.updateExchangeRates(newRates);
            console.log("Currency: Tasas actualizadas exitosamente con soporte multi-moneda.");
            return true;
        } catch (error) {
            console.error("Currency Error:", error);
            return false;
        }
    }
};
