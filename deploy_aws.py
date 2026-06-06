"""
deploy_aws.py - Automated deployment script for Project Saraswati on AWS serverless stack.

Prerequisites:
  1. AWS Credentials configured in your shell environment or .env:
     - AWS_ACCESS_KEY_ID
     - AWS_SECRET_ACCESS_KEY
     - AWS_DEFAULT_REGION (e.g. us-east-1)
  2. Database configured:
     - DATABASE_URL (connection URI for Neon/Supabase PostgreSQL)
  3. LLM API keys:
     - GROQ_API_KEY
     - OPENROUTER_API_KEY
  4. Docker installed and running on your Mac.
"""

import os
import sys
import json
import time
import subprocess
import shutil
from pathlib import Path
import boto3
from dotenv import load_dotenv

# Load credentials from .env if present
load_dotenv()

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
DATABASE_URL = os.getenv("DATABASE_URL")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")

# App configs
APP_NAME = "saraswati"
STAGE = "prod"

def check_requirements():
    print("🔍 Checking prerequisites...")
    
    missing = []
    if not AWS_ACCESS_KEY_ID: missing.append("AWS_ACCESS_KEY_ID")
    if not AWS_SECRET_ACCESS_KEY: missing.append("AWS_SECRET_ACCESS_KEY")
    if not DATABASE_URL: missing.append("DATABASE_URL")
    
    if missing:
        print(f"❌ Error: Missing credentials/configs in environment or .env file: {', '.join(missing)}")
        print("Please configure them in your .env file before deploying.")
        sys.exit(1)
        
    # Check Docker
    try:
        subprocess.run(["docker", "info"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✅ Docker is running.")
    except Exception:
        print("❌ Error: Docker is not running or not installed. AWS Lambda container build requires Docker.")
        sys.exit(1)
        
    # Check npm
    try:
        subprocess.run(["npm", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("✅ npm is installed.")
    except Exception:
        print("❌ Error: npm is not installed. Frontend build requires Node/npm.")
        sys.exit(1)

def get_boto_clients():
    session = boto3.Session(
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )
    return {
        "s3": session.client("s3"),
        "ecr": session.client("ecr"),
        "iam": session.client("iam"),
        "lambda": session.client("lambda"),
        "apigatewayv2": session.client("apigatewayv2"),
        "sts": session.client("sts"),
        "cloudfront": session.client("cloudfront")
    }

def create_s3_buckets(s3_client, account_id):
    # Unique suffix to prevent S3 bucket name conflicts
    suffix = f"{account_id}-{AWS_REGION}"
    cache_bucket = S3_BUCKET_NAME or f"{APP_NAME}-cache-{suffix}"
    web_bucket = f"{APP_NAME}-frontend-{suffix}"
    
    print(f"📦 Provisioning S3 Buckets...")
    
    # 1. Create Cache Bucket
    try:
        if AWS_REGION == "us-east-1":
            s3_client.create_bucket(Bucket=cache_bucket)
        else:
            s3_client.create_bucket(
                Bucket=cache_bucket,
                CreateBucketConfiguration={"LocationConstraint": AWS_REGION}
            )
        print(f"✅ Created Cache S3 Bucket: {cache_bucket}")
    except s3_client.exceptions.BucketAlreadyOwnedByYou:
        print(f"ℹ️ Cache S3 Bucket already exists and is owned by you: {cache_bucket}")
        
    # 2. Create Web Hosting Bucket
    try:
        if AWS_REGION == "us-east-1":
            s3_client.create_bucket(Bucket=web_bucket)
        else:
            s3_client.create_bucket(
                Bucket=web_bucket,
                CreateBucketConfiguration={"LocationConstraint": AWS_REGION}
            )
        
        # Configure Website Hosting
        s3_client.put_bucket_website(
            Bucket=web_bucket,
            WebsiteConfiguration={
                "ErrorDocument": {"Key": "index.html"},
                "IndexDocument": {"Suffix": "index.html"}
            }
        )
        
        # Public access block configuration (allow public reads for website)
        s3_client.put_public_access_block(
            Bucket=web_bucket,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": False,
                "IgnorePublicAcls": False,
                "BlockPublicPolicy": False,
                "RestrictPublicBuckets": False
            }
        )
        
        # Add Bucket Policy for Public Read
        policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": f"arn:aws:s3:::{web_bucket}/*"
                }
            ]
        }
        s3_client.put_bucket_policy(Bucket=web_bucket, Policy=json.dumps(policy))
        
        print(f"✅ Created Frontend S3 Bucket: {web_bucket}")
    except s3_client.exceptions.BucketAlreadyOwnedByYou:
        print(f"ℹ️ Frontend S3 Bucket already exists: {web_bucket}")
        
    return cache_bucket, web_bucket

def create_iam_role(iam_client):
    role_name = f"{APP_NAME}-lambda-execution-role"
    print(f"🔑 Provisioning IAM Role: {role_name}...")
    
    assume_role_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }
        ]
    }
    
    try:
        resp = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(assume_role_policy),
            Description="Lambda Execution Role for Saraswati serverless backend"
        )
        role_arn = resp["Role"]["Arn"]
        print(f"✅ Created new IAM Role.")
    except iam_client.exceptions.EntityAlreadyExistsException:
        role_arn = iam_client.get_role(RoleName=role_name)["Role"]["Arn"]
        print(f"ℹ️ IAM Role already exists.")
        
    # Attach Basic Execution Policy (logs)
    iam_client.attach_role_policy(
        RoleName=role_name,
        PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    )
    
    # Attach Full Access Policy for S3 (cache & thumbnails) and self-invocation permissions
    # Inline policy for S3 Access & Lambda self-invocation
    s3_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject",
                    "s3:ListBucket"
                ],
                "Resource": "*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "lambda:InvokeFunction"
                ],
                "Resource": "*"
            }
        ]
    }
    iam_client.put_role_policy(
        RoleName=role_name,
        PolicyName="S3AccessPolicy",
        PolicyDocument=json.dumps(s3_policy)
    )
    
    # Give it a second to propagate
    time.sleep(5)
    return role_arn

def build_and_push_container(ecr_client, account_id):
    repo_name = f"{APP_NAME}-backend"
    print(f"🐳 Provisioning ECR Repository and building Docker image...")
    
    # 1. Create ECR Repo if not exists
    try:
        resp = ecr_client.create_repository(repositoryName=repo_name)
        repository_uri = resp["repository"]["repositoryUri"]
        print(f"✅ Created ECR repository: {repository_uri}")
    except ecr_client.exceptions.RepositoryAlreadyExistsException:
        resp = ecr_client.describe_repositories(repositoryNames=[repo_name])
        repository_uri = resp["repositories"][0]["repositoryUri"]
        print(f"ℹ️ ECR repository already exists: {repository_uri}")
        
    # 2. Write Dockerfile.lambda dynamically
    dockerfile_content = """FROM public.ecr.aws/lambda/python:3.12
 
# Upgrade pip to make sure it resolves recent manylinux wheels
RUN pip install --no-cache-dir --upgrade pip
 
# Copy requirements.txt
COPY requirements.txt ${LAMBDA_TASK_ROOT}
 
# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt
 
# Copy Python codebase
COPY research/ ${LAMBDA_TASK_ROOT}/research/
 
# Set the handler to our Mangum handler
CMD [ "research.server_lambda.handler" ]
"""
    
    dockerfile_path = Path("Dockerfile.lambda")
    dockerfile_path.write_text(dockerfile_content)
    
    # 3. Docker Login to ECR
    print("🔑 Authenticating Docker with ECR...")
    auth_resp = ecr_client.get_authorization_token()
    token = auth_resp["authorizationData"][0]["authorizationToken"]
    import base64
    username, password = base64.b64decode(token).decode("utf-8").split(":")
    
    login_cmd = [
        "docker", "login",
        "--username", username,
        "--password-stdin",
        f"{account_id}.dkr.ecr.{AWS_REGION}.amazonaws.com"
    ]
    subprocess.run(login_cmd, input=password.encode(), check=True, stdout=subprocess.DEVNULL)
    
    # 4. Docker Build
    image_tag = f"{repository_uri}:latest"
    print(f"🛠️ Building Lambda-compatible Docker image: {image_tag}...")
    # Build for Linux/amd64 (or arm64, but amd64 is universally safe for standard Lambda execution)
    build_cmd = [
        "docker", "build",
        "--platform", "linux/amd64",
        "--provenance=false",
        "--sbom=false",
        "-f", "Dockerfile.lambda",
        "-t", image_tag,
        "."
    ]
    subprocess.run(build_cmd, check=True)
    
    # 5. Docker Push
    print(f"🚀 Pushing image to ECR...")
    push_cmd = ["docker", "push", image_tag]
    subprocess.run(push_cmd, check=True)
    
    # Clean up Dockerfile
    if dockerfile_path.exists():
        dockerfile_path.unlink()
        
    return image_tag

def deploy_lambda_function(lambda_client, image_uri, role_arn, cache_bucket):
    func_name = f"{APP_NAME}-backend"
    print(f"⚡ Deploying AWS Lambda function '{func_name}'...")
    
    # Environment variables for Lambda execution
    env_vars = {
        "Variables": {
            "DATABASE_URL": DATABASE_URL,
            "S3_BUCKET_NAME": cache_bucket,
            "GROQ_API_KEY": os.getenv("GROQ_API_KEY") or "",
            "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY") or "",
            "CEREBRAS_API_KEY": os.getenv("CEREBRAS_API_KEY") or ""
        }
    }
    
    try:
        # Create function
        resp = lambda_client.create_function(
            FunctionName=func_name,
            Role=role_arn,
            Code={"ImageUri": image_uri},
            PackageType="Image",
            Timeout=180, # Allow 3 min for research agents/API requests
            MemorySize=1024, # 1024 MB for running LiteLLM & PDF generation
            Environment=env_vars,
            Architectures=["x86_64"]
        )
        print(f"✅ Created Lambda Function successfully.")
        func_arn = resp["FunctionArn"]
    except lambda_client.exceptions.ResourceConflictException:
        # Update function code
        print(f"ℹ️ Lambda Function already exists. Updating container image...")
        resp = lambda_client.update_function_code(
            FunctionName=func_name,
            ImageUri=image_uri
        )
        
        # Wait for Lambda update to complete
        print("⏳ Waiting for Lambda function code update to complete...")
        for _ in range(30):
            func_info = lambda_client.get_function(FunctionName=func_name)
            last_update_status = func_info.get("Configuration", {}).get("LastUpdateStatus")
            state = func_info.get("Configuration", {}).get("State")
            if last_update_status != "InProgress" and state != "Pending":
                break
            time.sleep(2)
            
        # Update configuration (env vars)
        lambda_client.update_function_configuration(
            FunctionName=func_name,
            Environment=env_vars,
            Timeout=180,
            MemorySize=1024
        )
        print(f"✅ Updated Lambda Function image and configs.")
        func_arn = resp["FunctionArn"]
        
    return func_name, func_arn

def create_api_gateway(apigw_client, lambda_client, func_name, func_arn):
    api_name = f"{APP_NAME}-api"
    print(f"🌐 Provisioning API Gateway (HTTP API)...")
    
    # 1. Create HTTP API
    apis = apigw_client.get_apis().get("Items", [])
    api_id = None
    for api in apis:
        if api["Name"] == api_name:
            api_id = api["ApiId"]
            print(f"ℹ️ API Gateway already exists.")
            break
            
    if not api_id:
        resp = apigw_client.create_api(
            Name=api_name,
            ProtocolType="HTTP",
            Target=func_arn, # Direct integration
            CorsConfiguration={
                "AllowOrigins": ["*"],
                "AllowMethods": ["*"],
                "AllowHeaders": ["*"]
            }
        )
        api_id = resp["ApiId"]
        print(f"✅ Created HTTP API Gateway: {api_id}")
        
    # 2. Add Permission to Lambda to allow API Gateway invocations
    try:
        lambda_client.add_permission(
            FunctionName=func_name,
            StatementId="apigateway-invoke-permission",
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=f"arn:aws:execute-api:{AWS_REGION}:{func_arn.split(':')[4]}:{api_id}/*/*"
        )
        print("✅ Added invocation permissions to Lambda.")
    except lambda_client.exceptions.ResourceConflictException:
        pass
        
    # HTTP API base endpoint
    api_endpoint = f"https://{api_id}.execute-api.{AWS_REGION}.amazonaws.com"
    return api_endpoint
 
def create_cloudfront_distribution(cloudfront_client, web_bucket):
    print("🌐 Provisioning AWS CloudFront Distribution (this provides HTTPS)...")
    origin_domain = f"{web_bucket}.s3.us-east-1.amazonaws.com"
    if AWS_REGION != "us-east-1":
        origin_domain = f"{web_bucket}.s3.{AWS_REGION}.amazonaws.com"
        
    distributions = cloudfront_client.list_distributions()
    dist_id = None
    domain_name = None
    
    if 'DistributionList' in distributions and 'Items' in distributions['DistributionList']:
        for dist in distributions['DistributionList']['Items']:
            for origin in dist['Origins']['Items']:
                if origin['DomainName'] == origin_domain:
                    dist_id = dist['Id']
                    domain_name = dist['DomainName']
                    print(f"ℹ️ CloudFront Distribution already exists: {domain_name} (ID: {dist_id})")
                    break
            if dist_id:
                break

    # 1. Custom Domain & SSL Certificate Setup (US-East-1)
    custom_domains = []
    cert_arn = None
    if custom_domains:
        try:
            acm_client = boto3.client("acm", region_name="us-east-1",
                                      aws_access_key_id=AWS_ACCESS_KEY_ID,
                                      aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
            certs = acm_client.list_certificates(CertificateStatuses=["ISSUED"]).get("CertificateSummaryList", [])
            for c in certs:
                desc = acm_client.describe_certificate(CertificateArn=c["CertificateArn"])["Certificate"]
                sans = desc.get("SubjectAlternativeNames", [])
                if "research.saraswati.work.gd" in sans or "*.saraswati.work.gd" in sans:
                    cert_arn = c["CertificateArn"]
                    print(f"✅ Found ACM SSL Certificate covering subdomains: {cert_arn}")
                    break
        except Exception as e:
            print(f"⚠️ Error querying ACM certificate: {e}")

    # 2. CloudFront Function Setup (Not needed since we only use a single domain)
    func_arn = None

    # 3. Create or Update Distribution Configuration
    default_cache_behavior = {
        'TargetOriginId': 'S3-Origin',
        'ViewerProtocolPolicy': 'redirect-to-https',
        'AllowedMethods': {
            'Quantity': 2,
            'Items': ['GET', 'HEAD'],
            'CachedMethods': {
                'Quantity': 2,
                'Items': ['GET', 'HEAD']
            }
        },
        'ForwardedValues': {
            'QueryString': False,
            'Cookies': {'Forward': 'none'},
            'Headers': {'Quantity': 0},
            'QueryStringCacheKeys': {'Quantity': 0}
        },
        'MinTTL': 0,
        'DefaultTTL': 3600,
        'MaxTTL': 86400
    }
    if func_arn:
        default_cache_behavior['FunctionAssociations'] = {
            'Quantity': 1,
            'Items': [{
                'FunctionARN': func_arn,
                'EventType': 'viewer-request'
            }]
        }

    viewer_cert = {
        'CloudFrontDefaultCertificate': True,
        'MinimumProtocolVersion': 'TLSv1',
        'CertificateSource': 'cloudfront'
    }
    aliases = {'Quantity': 0}
    if cert_arn:
        aliases = {
            'Quantity': len(custom_domains),
            'Items': custom_domains
        }
        viewer_cert = {
            'ACMCertificateArn': cert_arn,
            'SSLSupportMethod': 'sni-only',
            'MinimumProtocolVersion': 'TLSv1.2_2021',
            'CertificateSource': 'acm'
        }

    if not dist_id:
        try:
            resp = cloudfront_client.create_distribution(
                DistributionConfig={
                    'CallerReference': f"saraswati-frontend-{int(time.time())}",
                    'Origins': {
                        'Quantity': 1,
                        'Items': [
                            {
                                'Id': 'S3-Origin',
                                'DomainName': origin_domain,
                                'S3OriginConfig': {
                                    'OriginAccessIdentity': ''
                                }
                            }
                        ]
                    },
                    'DefaultCacheBehavior': default_cache_behavior,
                    'CustomErrorResponses': {
                        'Quantity': 2,
                        'Items': [
                            {
                                'ErrorCode': 404,
                                'ResponsePagePath': '/index.html',
                                'ResponseCode': '200',
                                'ErrorCachingMinTTL': 300
                            },
                            {
                                'ErrorCode': 403,
                                'ResponsePagePath': '/index.html',
                                'ResponseCode': '200',
                                'ErrorCachingMinTTL': 300
                            }
                        ]
                    },
                    'Comment': 'Saraswati Frontend',
                    'Enabled': True,
                    'Aliases': aliases,
                    'ViewerCertificate': viewer_cert
                }
            )
            dist_id = resp['Distribution']['Id']
            domain_name = resp['Distribution']['DomainName']
            print(f"✅ Created CloudFront Distribution: {domain_name}")
        except Exception as e:
            print(f"⚠️ Error creating CloudFront distribution: {e}")
            print("Falling back to raw S3 website hosting...")
    else:
        # Update existing distribution if needed
        try:
            dist_resp = cloudfront_client.get_distribution_config(Id=dist_id)
            config = dist_resp["DistributionConfig"]
            etag = dist_resp["ETag"]
            
            # Check if we need to apply updates
            needs_update = False
            
            # Compare ViewerCertificate
            current_cert = config.get("ViewerCertificate", {})
            if cert_arn:
                if current_cert.get("ACMCertificateArn") != cert_arn:
                    config["ViewerCertificate"] = viewer_cert
                    needs_update = True
            else:
                if not current_cert.get("CloudFrontDefaultCertificate"):
                    config["ViewerCertificate"] = {
                        'CloudFrontDefaultCertificate': True,
                        'MinimumProtocolVersion': 'TLSv1',
                        'CertificateSource': 'cloudfront'
                    }
                    needs_update = True
                    
            # Compare Aliases
            current_aliases = set(config.get("Aliases", {}).get("Items", []))
            target_aliases = set(custom_domains)
            if current_aliases != target_aliases:
                config["Aliases"] = aliases
                needs_update = True
                
            existing_funcs = config.get("DefaultCacheBehavior", {}).get("FunctionAssociations", {}).get("Items", [])
            existing_func_arn = existing_funcs[0]["FunctionARN"] if existing_funcs else None
            if func_arn != existing_func_arn:
                if func_arn:
                    config["DefaultCacheBehavior"]["FunctionAssociations"] = default_cache_behavior["FunctionAssociations"]
                else:
                    config["DefaultCacheBehavior"]["FunctionAssociations"] = {"Quantity": 0}
                needs_update = True
                
            if needs_update:
                print("🛠️ Updating existing CloudFront distribution config for CNAMEs and SSL...")
                cloudfront_client.update_distribution(
                    Id=dist_id,
                    IfMatch=etag,
                    DistributionConfig=config
                )
                print("✅ Submitted CloudFront distribution updates successfully.")
            else:
                print("ℹ️ CloudFront configuration is already up-to-date.")
                
        except Exception as e:
            print(f"⚠️ Failed to update CloudFront distribution: {e}")

    if domain_name:
        url = f"https://{custom_domains[0]}" if cert_arn else f"https://{domain_name}"
        return url, dist_id
    return f"http://{web_bucket}.s3-website-{AWS_REGION}.amazonaws.com", None
 
def build_and_deploy_frontend(s3_client, web_bucket, api_url):
    print(f"🖥️ Building and deploying React frontend to S3...")
    
    # Write api configuration locally
    config_file_path = Path("ui/src/config.ts")
    original_config = config_file_path.read_text() if config_file_path.exists() else ""
    
    # Write updated API URL configuration
    new_config = f"""// Auto-generated config by deploy_aws.py
export const API_BASE_URL = "{api_url}";
"""
    config_file_path.write_text(new_config)
    
    try:
        # Build Vite project
        print("🛠️ Running frontend build...")
        subprocess.run(["npm", "run", "build"], cwd="ui", shell=False, check=True)
        
        # Upload build/dist directory to S3
        dist_dir = Path("ui/dist")
        if not dist_dir.exists():
            raise FileNotFoundError("ui/dist build folder was not generated!")
            
        print(f"🚀 Uploading files to S3 bucket '{web_bucket}'...")
        file_count = 0
        for file_path in dist_dir.rglob("*"):
            if file_path.is_file():
                s3_key = str(file_path.relative_to(dist_dir))
                
                # Determine Content-Type
                content_type = "text/plain"
                if file_path.suffix == ".html": content_type = "text/html"
                elif file_path.suffix == ".js": content_type = "application/javascript"
                elif file_path.suffix == ".css": content_type = "text/css"
                elif file_path.suffix == ".png": content_type = "image/png"
                elif file_path.suffix == ".svg": content_type = "image/svg+xml"
                elif file_path.suffix == ".ico": content_type = "image/x-icon"
                elif file_path.suffix == ".json": content_type = "application/json"
                
                s3_client.upload_file(
                    Filename=str(file_path),
                    Bucket=web_bucket,
                    Key=s3_key,
                    ExtraArgs={"ContentType": content_type}
                )
                file_count += 1
        print(f"✅ Successfully uploaded {file_count} files to S3.")
        
    finally:
        # Restore original config.ts to avoid polluting git working tree
        if original_config:
            config_file_path.write_text(original_config)

def main():
    print("==================================================")
    print("    Saraswati Research Engine Deployment script   ")
    print("==================================================")
    
    check_requirements()
    
    clients = get_boto_clients()
    
    # Get Account ID
    account_id = clients["sts"].get_caller_identity()["Account"]
    print(f"👤 AWS Caller Account ID: {account_id}")
    
    # 1. Create S3 Buckets
    cache_bucket, web_bucket = create_s3_buckets(clients["s3"], account_id)
    
    # 2. Create IAM Role
    role_arn = create_iam_role(clients["iam"])
    
    # 3. Build & Push ECR container
    image_uri = build_and_push_container(clients["ecr"], account_id)
    
    # 4. Deploy/Update Lambda
    func_name, func_arn = deploy_lambda_function(clients["lambda"], image_uri, role_arn, cache_bucket)
    
    # 5. Create API Gateway
    api_url = create_api_gateway(clients["apigatewayv2"], clients["lambda"], func_name, func_arn)
    print(f"✅ Live API URL: {api_url}")
    
    # Create/Get CloudFront Distribution (HTTPS)
    frontend_url, dist_id = create_cloudfront_distribution(clients["cloudfront"], web_bucket)
    
    # 6. Build and Deploy frontend
    build_and_deploy_frontend(clients["s3"], web_bucket, api_url)

    # 7. Invalidate CloudFront Cache to ensure new assets load instantly
    if dist_id:
        try:
            import time
            print(f"🧹 Invalidating CloudFront cache for distribution {dist_id}...")
            clients["cloudfront"].create_invalidation(
                DistributionId=dist_id,
                InvalidationBatch={
                    'Paths': {
                        'Quantity': 1,
                        'Items': ['/*']
                    },
                    'CallerReference': f"invalidation-{int(time.time())}"
                }
            )
            print("✅ CloudFront cache invalidation request submitted successfully.")
        except Exception as e:
            print(f"⚠️ Warning: Failed to invalidate CloudFront cache: {e}")
    
    print("\n🎉 ==================================================")
    print("🎉 DEPLOYMENT COMPLETE!")
    print("🎉 ==================================================")
    print(f"🌍 Live Application URL (HTTPS): {frontend_url}")
    print(f"⚡ Live API Endpoint:            {api_url}")
    print(f"📦 S3 Cache Bucket:              {cache_bucket}")
    print("==================================================\n")

if __name__ == "__main__":
    main()
