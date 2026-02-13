# Tesla Engine Sound App

Esta es una aplicación web progresiva (PWA) que simula el sonido de un motor basado en la velocidad de tu coche utilizando el GPS de tu teléfono.

## Instrucciones de Uso

1. **Abrir la App en el Teléfono**:
   - Necesitas servir estos archivos en un servidor local o subirlos a un hosting gratuito (como GitHub Pages o Vercel).
   - Debido a políticas de seguridad de los navegadores, el GPS y el Audio funcionan mejor bajo `https` o `localhost`.

2. **Conectar al Tesla**:
   - Conecta tu teléfono al Bluetooth de tu Tesla Model 3.
   - Selecciona el teléfono como fuente de audio en la pantalla del Tesla.

3. **Iniciar**:
   - Abre la app y presiona "INICIAR MOTOR".
   - Concede permisos de **Ubicación** cuando se te solicite (escrutial para detectar la velocidad).
   - ¡Conduce! El sonido cambiará según tu velocidad real.

## Notas Técnicas
- La app usa **Web Audio API** para sintetizar el sonido en tiempo real (no usa grabaciones estáticas), lo que permite una transición suave de RPM.
- Usa **GPS** para la velocidad porque acceder a la telemetría del Tesla por cable requiere hardware costoso.
- Mantén la pantalla encendida (la app intentará mantenerla activa automáticamente).

## Instalación (Opcional)
En Android/iOS, puedes usar la opción "Agregar a pantalla de inicio" para instalarla como una app nativa.
