# FSL-1.1-Apache-2.0 — canonical template

This is the FSL-1.1-Apache-2.0 license text used across the Lloyal runtime stack.
Lloyal's additional application-building permissions live in the separate
[Developer Grant](https://github.com/lloyal-ai/hdk/blob/8678ebcd02c425b9e569d97e58063e2af143ffb7/GRANT.md).

## Parameters

| Marker | Value at instantiation |
|---|---|
| `\<Year>` | The applicable copyright year |
| `\<Licensor>` | The party offering the Software (`Lloyal Labs Pty Ltd`) |

## Template

> Copy the license between the dividers into the repo's `LICENSE` file and
> substitute the copyright notice parameters above. Do not modify the operative text.

---

# Functional Source License, Version 1.1, Apache 2.0 Future License

## Abbreviation

FSL-1.1-Apache-2.0

## Notice

Copyright \<Year> \<Licensor>

## Terms and Conditions

### Licensor ("We")

The party offering the Software under these Terms and Conditions.

### The Software

The "Software" is each version of the software that we make available under
these Terms and Conditions, as indicated by our inclusion of these Terms and
Conditions with the Software.

### License Grant

Subject to your compliance with this License Grant and the Patents,
Redistribution and Trademark clauses below, we hereby grant you the right to
use, copy, modify, create derivative works, publish, and distribute the
Software for any Permitted Purpose identified below.

### Permitted Purpose

A "Permitted Purpose" is any purpose other than a Competing Use. A
"Competing Use" means making the Software available to others in a
commercial product or service that:

1. substitutes for the Software;

2. substitutes for any other product or service we offer using the Software
   that exists as of the date we make the Software available; or

3. offers the same or substantially similar functionality as the Software.

Permitted Purposes specifically include using the Software:

1. for your internal use and access;

2. for non-commercial education;

3. for non-commercial research; and

4. in connection with professional services that you provide to a Licensee
   using the Software in accordance with these Terms and Conditions.

### Patents

To the extent your use for a Permitted Purpose would necessarily infringe our
patents, the license grant above includes a license under our patents. If you
make a claim against any party that the Software infringes or contributes to
the infringement of any patent, then your patent license to the Software ends
immediately.

### Redistribution

The Terms and Conditions apply to all copies, modifications and derivatives
of the Software.

If you redistribute any copies, modifications or derivatives of the Software,
you must include a copy of or a link to these Terms and Conditions and not
remove any copyright notices provided in or with the Software.

### Disclaimer

THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTIES OF ANY KIND,
INCLUDING WITHOUT LIMITATION WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABILITY, TITLE OR NON-INFRINGEMENT.

IN NO EVENT WILL WE HAVE ANY LIABILITY TO YOU ARISING OUT OF OR RELATED TO
THE SOFTWARE, INCLUDING INDIRECT, SPECIAL, INCIDENTAL OR CONSEQUENTIAL
DAMAGES, EVEN IF WE HAVE BEEN INFORMED OF THEIR POSSIBILITY IN ADVANCE.

### Trademarks

Except for displaying the License Details and identifying us as the origin of
the Software, you have no right under these Terms and Conditions to use our
trademarks, trade names, service marks or product names.

## Grant of Future License

We hereby irrevocably grant you an additional license to use the Software
under the Apache License, Version 2.0 that is effective on the second
anniversary of the date we make the Software available. On or after that
date, you may use the Software under the Apache License, Version 2.0, in
which case the following will apply:

Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License.

You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

See the License for the specific language governing permissions and
limitations under the License.

---

## Notes for repo maintainers

- **Conversion date:** Each version becomes available under Apache 2.0 on the
  second anniversary of the date it is first made available. There is no
  `\<Change Date>`, `\<Software>` or Effective Date placeholder in this template.
  A copyright year is not a version's release date.
- **Per-version history:** Keep release history identifying when each version
  was first made available. The same unmodified license text can accompany
  successive versions; each version has its own two-year clock.
- **Apache 2.0 conversion:** The additional license is irrevocable and takes
  effect automatically. Lloyal Labs need not change the published artifact
  when that anniversary arrives.
- **Additional permissions:** Include `GRANT.md` alongside `LICENSE`. HDK's
  `GRANT.md` is the canonical grant and `licensing/faq.md` in this docs repository
  is the canonical FAQ. Use HDK's `scripts/sync-license-faq.sh` to update copies
  and its `--check` mode to detect drift.
- **Source:** The standard FSL text is published at
  https://github.com/getsentry/fsl.software. Lloyal's grant supplements it without
  modifying the operative text. See the
  [Licensing FAQ](https://docs.lloyal.ai/licensing/faq).
