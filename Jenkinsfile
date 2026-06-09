pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'your-registry.azurecr.io'
        DOCKER_CREDENTIALS_ID = 'docker-registry-credentials'
        KUBECONFIG_CREDENTIALS_ID = 'kubeconfig'
        IMAGE_NAME = "${DOCKER_REGISTRY}/cart-services"
        K8S_NAMESPACE = 'choosemood'
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/sandeep821110/cart-services.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Build Docker Image') {
            steps {
                sh """
                    docker build \
                        -t ${IMAGE_NAME}:${BUILD_NUMBER} \
                        -t ${IMAGE_NAME}:latest \
                        .
                """
            }
        }

        stage('Push Docker Image') {
            steps {
                script {
                    docker.withRegistry("https://${DOCKER_REGISTRY}", DOCKER_CREDENTIALS_ID) {
                        docker.image("${IMAGE_NAME}:${BUILD_NUMBER}").push()
                        docker.image("${IMAGE_NAME}:latest").push()
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    withKubeConfig([credentialsId: KUBECONFIG_CREDENTIALS_ID]) {
                        sh """
                            sed -i 's|image: .*/cart-services:.*|image: ${IMAGE_NAME}:${BUILD_NUMBER}|g' k8s/deployment.yaml
                            kubectl apply -f k8s/ -n ${K8S_NAMESPACE}
                            kubectl rollout status deployment/cart-services -n ${K8S_NAMESPACE} --timeout=180s
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            echo "cart-services deployment ${BUILD_NUMBER} succeeded."
        }
        failure {
            echo "cart-services deployment ${BUILD_NUMBER} failed."
        }
        always {
            cleanWs()
        }
    }
}
