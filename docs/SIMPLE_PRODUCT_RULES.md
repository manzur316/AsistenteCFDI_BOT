# Simple Product Rules

## Principio

Entrada simple, motor completo.

El usuario debe poder escribir como tecnico o pyme, sin hablar como contador. El
motor interno puede tener contratos, impuestos, storage, PAC adapters y reportes,
pero la UI debe mantenerse pequena y clara.

## No Extremo Simple

El bot no debe mandar todo al contador. Debe resolver lo que pueda resolver con
reglas locales, catalogo auditado, guardrails fiscales y contratos canonicos.

Debe resolver:

- Cliente conocido y validado.
- Trabajo claro.
- Concepto permitido.
- Monto simple.
- IVA simple.
- Preview sujeto a revision humana.

Debe pedir ayuda cuando falte:

- Cliente fiscal.
- Equipo o sistema atendido.
- Monto por partida.
- Separacion material/mano de obra.
- Motivo de cancelacion.
- Actividad fuera de alcance.

## No ERP

No convertir el bot en ERP complejo.

Fuera de alcance:

- 40 menus.
- Polizas.
- Balanza.
- Mayor.
- Asientos contables.
- Contabilidad completa.
- Conciliacion bancaria compleja.
- Gestion multiempresa pesada.

## Modos

### Modo Rapido

Entrada natural:

```text
Privada Demo, revise camaras por 800 + IVA
```

El bot intenta resolver cliente, trabajo, concepto, monto e impuestos. Si puede,
muestra preview. Si no puede, pregunta lo minimo.

### Modo Guiado

El bot pregunta paso a paso:

- Cliente.
- Trabajo.
- Tipo de operacion.
- Monto.
- IVA.
- Revision final.

### Modo Revision

El usuario revisa borradores, pagos, cancelaciones y reportes. El sistema muestra
lo necesario para decidir, sin exponer detalles PAC crudos.

## Accesos Principales

Maximo recomendado:

- Nueva factura.
- Pendientes.
- Pagos/Cobros.
- Reporte del mes.
- Ayuda.

## Guardrails UX

- Confirmar nunca salta blockers fiscales.
- Cancelar cambia estado; no borra.
- Editar debe conservar contexto y audit trail.
- El formato PAC nunca debe aparecer como requisito de usuario.
- La UI dice "borrador", no "factura timbrada", hasta que exista fase PAC real.
- Todo documento fiscal mantiene "BORRADOR SUJETO A REVISION HUMANA".
