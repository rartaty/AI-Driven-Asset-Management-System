# Public Architecture Notes

The public source edition keeps the layers that establish Project Big Tester as a full-stack asset-management platform: dashboard, API boundary, configuration, persistence models, safety controls, and local infrastructure.

The private execution layer is deliberately absent. In particular, no market adapter, account adapter, order submission, strategy evaluation, model prompt, threshold, allocation rule, or portfolio-specific data is published. This boundary preserves both account safety and the confidentiality of investment methods while allowing an engineering review of the system architecture.