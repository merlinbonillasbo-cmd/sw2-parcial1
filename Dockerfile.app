FROM eclipse-temurin:21-noble

# Instalar herramientas básicas y Node.js v22.18.0 oficial (requerido por generator-jhipster)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    zip \
    ca-certificates \
    && ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
         aarch64|arm64) ARCH='arm64' ;; \
         amd64|x86_64) ARCH='x64' ;; \
         *) echo "Arquitectura no soportada: ${ARCH}"; exit 1 ;; \
       esac \
    && curl -fsSL https://nodejs.org/dist/v22.18.0/node-v22.18.0-linux-${ARCH}.tar.gz -o /tmp/node.tar.gz \
    && tar -C /usr/local --strip-components 1 -xzf /tmp/node.tar.gz \
    && rm -rf /tmp/* \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# IMPORTANTE: El directorio de trabajo DEBE llamarse generator-jhipster
# para que Yeoman registre el namespace 'jhipster' correctamente.
WORKDIR /app/generator-jhipster

# Copiar manifiestos de dependencias
COPY package*.json ./

# Instalar dependencias sin ejecutar scripts de preparación
RUN npm ci --ignore-scripts

# Copiar todo el código fuente del proyecto
COPY . .

# Compilar el código TypeScript
RUN npm run build

# Crear directorios para proyectos generados y uploads
RUN mkdir -p web-app/generated web-app/uploads

# Exponer el puerto del servidor web
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Ejecutar el servidor Express
CMD ["node", "web-app/server.js"]
