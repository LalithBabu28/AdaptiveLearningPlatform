
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
client = MongoClient(MONGO_URL)
# Database
db = client["adaptive_learning"]

# Collections
students_collection = db["students"]
assignments_collection = db["assignments"]
results_collection = db["results"]
labs_collection = db["labs"]

