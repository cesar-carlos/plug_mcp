# Certificado sintético de testes

O certificado e sua chave são fixtures públicas, exclusivamente para servidores locais de teste.
Não representam credenciais de produção. O cliente HTTPS confia nesse certificado por injeção;
o navegador limita a exceção ao SPKI dessa fixture. Não desabilitar validação TLS globalmente.
