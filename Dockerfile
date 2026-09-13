FROM eclipse-temurin:25-jre

WORKDIR /app

COPY backend/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]