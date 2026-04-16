# import json
# import os

# # In-memory storage
# students = {}
# assignments = {}
# results = {}
# labs = {}

# DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


# def save_data():
#     os.makedirs(DATA_DIR, exist_ok=True)
#     with open(os.path.join(DATA_DIR, "students.json"), "w") as f:
#         json.dump(students, f, indent=2)
#     with open(os.path.join(DATA_DIR, "assignments.json"), "w") as f:
#         json.dump(assignments, f, indent=2)
#     with open(os.path.join(DATA_DIR, "results.json"), "w") as f:
#         json.dump(results, f, indent=2)
#     with open(os.path.join(DATA_DIR, "labs.json"), "w") as f:
#         json.dump(labs, f, indent=2)


# def load_data():
#     global students, assignments, results, labs
#     os.makedirs(DATA_DIR, exist_ok=True)

#     def load_file(filename, default):
#         path = os.path.join(DATA_DIR, filename)
#         if os.path.exists(path):
#             with open(path, "r") as f:
#                 return json.load(f)
#         return default

#     students = load_file("students.json", {})
#     assignments = load_file("assignments.json", {})
#     results = load_file("results.json", {})
#     labs = load_file("labs.json", {})


# def get_latest_result(student_email: str, subject: str) -> dict | None:
#     """
#     Return the most recent test result for a student+subject combination.
#     Results are stored under keys like '<email>_<subject>_<timestamp>' or
#     the legacy '<email>_<subject>' key.  We find all matching keys, sort by
#     date_time (ISO string sort is safe here), and return the latest.
#     """
#     prefix = f"{student_email}_{subject}"
#     matching = [v for k, v in results.items() if k.startswith(prefix)]
#     if not matching:
#         return None
#     # Sort by date_time descending (ISO strings sort lexicographically)
#     matching.sort(key=lambda r: r.get("date_time", ""), reverse=True)
#     return matching[0]


# # Load on startup
# load_data()

# # Seed demo students if empty — no "level" field stored globally anymore
# if not students:
#     students["student1@demo.com"] = {
#         "name": "Alice Johnson",
#         "email": "student1@demo.com",
#         "password": "student123",
#     }
#     students["student2@demo.com"] = {
#         "name": "Bob Smith",
#         "email": "student2@demo.com",
#         "password": "student123",
#     }
#     save_data()
