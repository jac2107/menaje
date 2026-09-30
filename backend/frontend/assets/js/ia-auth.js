/**
 * ia-auth.js
 * Utilidades de sesion compartidas por los componentes de IA (ChatWidget y
 * RecommendationCards), que antes duplicaban getJWT/getUserId con manejos de
 * error distintos.
 *
 * El payload del JWT se decodifica SIN verificar la firma: sirve solo para
 * mostrar informacion en la interfaz. La autoridad sobre la identidad es
 * siempre el servidor, que toma el usuario del token verificado
 * (backend/routes/index.js) e ignora el usuario_id que envie el cliente
 * (de hecho los componentes ya no lo envian).
 *
 * Debe cargarse ANTES de chatwidget.js y recommendationcards.js en las cuatro
 * paginas que usan los componentes: si falta, window.IAAuth queda indefinido y
 * el chat se queda sin token.
 */
window.IAAuth = {
    /** Token JWT en crudo, o cadena vacia si no hay sesion. */
    getJWT() {
        try {
            return localStorage.getItem('token') || '';
        } catch {
            return ''; // localStorage puede lanzar en modo privado o con cookies bloqueadas
        }
    },

    /** Id del usuario segun el payload del JWT; null si no se puede determinar. */
    getUserId() {
        const token = this.getJWT();
        if (!token) return null;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id ?? payload.usuario_id ?? null;
        } catch {
            try {
                return localStorage.getItem('usuario_id');
            } catch {
                return null;
            }
        }
    },

    /** Cabeceras para una peticion autenticada a la API. */
    authHeaders(extra = {}) {
        return { 'Authorization': `Bearer ${this.getJWT()}`, ...extra };
    }
};
