// services/colaEmbeddings.js - Avisa al worker de python-ia de que un producto cambio y su
// embedding hay que regenerarlo (Fase 6A). Escribe en un SET de Redis (ia:embeddings_pendientes)
// que vacia worker_tareas.py; varias ediciones seguidas del mismo producto dejan una sola entrada.
//
// Garantia clave: NUNCA lanza ni retrasa el guardado del producto. Si Redis no responde se
// registra un aviso y se sigue; los embeddings pendientes se recuperan lanzando la tarea
// "regenerar_embeddings" del Panel IA.
const { createClient } = require('redis');

const CLAVE = 'ia:embeddings_pendientes';

const TIMEOUT_MS = 1500;

let cliente = null;

function nuevoCliente() {
    // Sin reconexion automatica: si Redis esta caido, falla rapido y la siguiente
    // llamada vuelve a intentarlo con un cliente nuevo.
    const c = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379/0',
        socket: { connectTimeout: TIMEOUT_MS, reconnectStrategy: false }
    });
    c.on('error', () => { /* se informa en encolarEmbeddingProducto */ });
    return c;
}

function conTimeout(promesa) {
    let temporizador;
    const limite = new Promise((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error('Redis no responde')), TIMEOUT_MS);
    });
    return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador));
}

function descartarCliente() {
    if (cliente) { cliente.disconnect().catch(() => {}); cliente = null; }
}

/** @returns {Promise<boolean>} true si quedo encolado; false (con aviso en el log) si no. */
async function encolarEmbeddingProducto(idProducto) {
    try {
        if (!cliente || !cliente.isReady) {
            descartarCliente();
            cliente = nuevoCliente();
            await conTimeout(cliente.connect());
        }
        await conTimeout(cliente.sAdd(CLAVE, String(idProducto)));
        return true;
    } catch (error) {
        console.warn(
            `⚠️  No se pudo encolar la regeneración del embedding del producto ${idProducto} ` +
            `(${error.message}). El producto se guardó igual; usa "regenerar_embeddings" en el Panel IA.`
        );
        descartarCliente();
        return false;
    }
}

async function cerrar() {
    descartarCliente();
}

module.exports = { encolarEmbeddingProducto, cerrar, CLAVE };
