import { State } from './state.js';

export const CurrencyService = {
    // Usaremos ExchangeRate-API (gratuita, libre y soporta COP/RUB)
    API_URL: 'https://open.er-api.com/v6/latest',

    async updateRates() {
        const base = State.db.settings.baseCurrency || 'USD';
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
                if (newRates.hasOwnProperty(currency) || ['EUR', 'USD', 'COP', 'RUB'].includes(currency)) {
                    const rateVal = parseFloat(data.rates[currency]);
                    if (rateVal && rateVal > 0) {
                        newRates[currency] = rateVal;
                    }
                }
            });
            
            State.updateExchangeRates(newRates);
            console.log("Currency: Tasas actualizadas exitosamente con soporte multi-moneda.");
            return true;
        } catch (error) {
            console.error("Currency Error:", error);
            return false;
        }
    }
};
