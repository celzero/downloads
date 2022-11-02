#!/usr/bin/env python
# exec env $(cat ./.cf.credentials | xargs) ./dbip-upload.py
# asn.v64: iptoasn.com/data/ip2asn-combined.tsv.gz
import boto3
import os
import pprint
from botocore.client import Config
from datetime import datetime,timezone

account_id = os.getenv('CF_ID')
access_key_id = os.getenv('CF_KEY')
secret_access_key = os.getenv('CF_SECRET')

endpoint = f'https://{account_id}.r2.cloudflarestorage.com'

bkt = u'rdns'
pre = u'geoip'
db4 = u'dbip.v4'
db6 = u'dbip.v6'
asn64 = u'asn.v64'
# ex: 1655830807.1231544
utcnow = datetime.now(timezone.utc)
tstamp = utcnow.timestamp()
year = utcnow.year
# ex: '2022/1655830807123'
dirent = str(pre) + '/' + str(year) + '/' + str(round(tstamp * 1000))
path_db4 = dirent + '/' + db4
path_db6 = dirent + '/' + db6
path_asn64 = dirent + '/' + asn64

# boto3.amazonaws.com/v1/documentation/api/latest/guide/s3-uploading-files.html
# boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html#S3.Client.upload_file
cl = boto3.client(
    's3',
    aws_access_key_id=access_key_id,
    aws_secret_access_key=secret_access_key,
    endpoint_url=endpoint,
    config=Config(
        region_name = 'auto',
        s3={'addressing_style': 'path'},
        retries=dict( max_attempts=2 ),
    ),
)

cl.upload_file(Bucket=bkt, Key=path_db4, Filename=db4)
cl.upload_file(Bucket=bkt, Key=path_db6, Filename=db6)
cl.upload_file(Bucket=bkt, Key=path_db6, Filename=asn64)

print("url:", endpoint, "ver:", tstamp)
print("bkt:", bkt, "p:", dirent)
print("db4:", path_db4)
print("db6:", path_db6)
print("asn64:", path_asn64)
