FROM eclipse-temurin:25-jdk AS builder

WORKDIR /workspace

COPY backend/gradlew backend/gradlew
COPY backend/gradle backend/gradle
COPY backend/build.gradle backend/settings.gradle backend/

RUN chmod +x backend/gradlew

RUN cd backend && ./gradlew dependencies --no-daemon

COPY backend/src backend/src

RUN cd backend && ./gradlew clean bootJar --no-daemon


FROM eclipse-temurin:25-jre

WORKDIR /app

COPY --from=builder /workspace/backend/build/libs/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]