#!/usr/bin/env python3

# SPDX-License-Identifier: Apache-2.0
import csv
import gzip
import ipaddress
import sys

"""
Usage:
Download ip-to-country csv db: db-ip.com/db/download/ip-to-country-lite

$ python dbip_shrink.py dbip-country-[date].csv.gz dbip
Writes a packed binary file suitable for bisection search.

Thanks to DB-IP.com for offering a suitable database under a CC-BY license.

ref: github.com/Jigsaw-Code/Intra/blob/6c2e5ba/scripts/dbip_shrink.py
"""
infile = gzip.open(sys.argv[1], mode='rt')
out_prefix = sys.argv[2]

v4file = open(out_prefix + '.v4', 'wb')
v6file = open(out_prefix + '.v6', 'wb')
skipped = 0

for start, end, country in csv.reader(infile):
  try:
    a = ipaddress.ip_address(start)
    f = v4file if a.version == 4 else v6file
    f.write(a.packed)
    f.write(bytes(country, 'us-ascii'))
  except ipaddress.AddressValueError:
    skipped += 1
    continue

print(skipped)
infile.close()
v4file.close()
v6file.close()
