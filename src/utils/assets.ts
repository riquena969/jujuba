/** Prefixa o BASE_URL do Vite (no GitHub Pages o app vive em /jujuba/).
 *  Passar caminhos SEM barra inicial: asset('models/jujuba.glb'). */
export const asset = (path: string): string => import.meta.env.BASE_URL + path
